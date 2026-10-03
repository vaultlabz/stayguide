// 2026-10-03 11:39, tablet pairing: one-time codes from the dashboard, long-lived device tokens (stored hashed)
import crypto from 'crypto';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { db } from '../utils/database';
import { Device } from '../types';
import { MockDeviceService } from './MockDeviceService';
import { MOCK_MODE } from '../utils/mock-database';

const PAIRING_CODE_TTL_MS = 15 * 60 * 1000;
const LAST_SEEN_THROTTLE_MS = 60 * 1000;

export const hashDeviceToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

export class DeviceService {
  private mockService = new MockDeviceService();

  /** Create a pending device with a 6-digit code valid for 15 minutes. */
  async createPairingCode(propertyId: number, name?: string): Promise<{ device: Device; code: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);

    // Retry on the (unlikely) collision with another unexpired pending code
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
      if (await this.findPendingByCode(code)) continue;

      const device = await this.createPending(propertyId, name, code, expiresAt);
      console.log(`Pairing code created for property ${propertyId} (device ${device.id})`);
      return { device, code, expiresAt };
    }
    throw new Error('Could not generate a unique pairing code');
  }

  /** Exchange a pairing code for a device token. Returns null if the code is invalid/expired/used. */
  async redeemPairingCode(code: string): Promise<{ device: Device; token: string } | null> {
    if (!/^\d{6}$/.test(code)) return null;

    const device = await this.findPendingByCode(code);
    if (!device) return null;

    const token = crypto.randomBytes(32).toString('base64url');
    const activated = await this.activate(device.id, code, hashDeviceToken(token));
    if (!activated) return null; // another request redeemed it first

    console.log(`Device ${device.id} paired to property ${device.property_id}`);
    return { device: { ...device, status: 'active' }, token };
  }

  /** Resolve a raw device token to an active device, updating last_seen (throttled). */
  async authenticate(token: string): Promise<Device | null> {
    const device = await this.findActiveByTokenHash(hashDeviceToken(token));
    if (!device) return null;

    const lastSeen = device.last_seen_at ? new Date(device.last_seen_at).getTime() : 0;
    if (Date.now() - lastSeen > LAST_SEEN_THROTTLE_MS) {
      await this.touch(device.id);
    }
    return device;
  }

  async listByProperty(propertyId: number): Promise<Device[]> {
    if (MOCK_MODE) return this.mockService.listByProperty(propertyId);

    try {
      const [rows] = await db.execute<RowDataPacket[]>(
        `SELECT id, property_id, type, name, status, pairing_expires_at, last_seen_at, created_at
         FROM devices WHERE property_id = ? AND status != 'revoked' ORDER BY created_at DESC`,
        [propertyId]
      );
      return rows as Device[];
    } catch (error) {
      console.error('Error listing devices:', error);
      throw new Error('Failed to list devices');
    }
  }

  async revoke(id: number, propertyId: number): Promise<boolean> {
    if (MOCK_MODE) return this.mockService.revoke(id, propertyId);

    try {
      const [result] = await db.execute<ResultSetHeader>(
        `UPDATE devices SET status = 'revoked', token_hash = NULL, pairing_code = NULL
         WHERE id = ? AND property_id = ? AND status != 'revoked'`,
        [id, propertyId]
      );
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error revoking device:', error);
      throw new Error('Failed to revoke device');
    }
  }

  private async createPending(propertyId: number, name: string | undefined, code: string, expiresAt: Date): Promise<Device> {
    if (MOCK_MODE) return this.mockService.createPending(propertyId, name, code, expiresAt);

    try {
      const [result] = await db.execute<ResultSetHeader>(
        `INSERT INTO devices (property_id, type, name, pairing_code, pairing_expires_at, status)
         VALUES (?, 'tablet', ?, ?, ?, 'pending')`,
        [propertyId, name || null, code, expiresAt]
      );
      return {
        id: result.insertId,
        property_id: propertyId,
        type: 'tablet',
        name,
        pairing_code: code,
        pairing_expires_at: expiresAt,
        status: 'pending',
        created_at: new Date()
      };
    } catch (error) {
      console.error('Error creating pending device:', error);
      throw new Error('Failed to create pairing code');
    }
  }

  private async findPendingByCode(code: string): Promise<Device | null> {
    if (MOCK_MODE) return this.mockService.findPendingByCode(code);

    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM devices
       WHERE pairing_code = ? AND status = 'pending' AND pairing_expires_at > CURRENT_TIMESTAMP`,
      [code]
    );
    return (rows[0] as Device) || null;
  }

  private async activate(id: number, code: string, tokenHash: string): Promise<boolean> {
    if (MOCK_MODE) {
      await this.mockService.activate(id, tokenHash);
      return true;
    }

    // Conditional update so a code can only be redeemed once, even under concurrent requests
    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE devices
       SET token_hash = ?, pairing_code = NULL, pairing_expires_at = NULL, status = 'active', last_seen_at = CURRENT_TIMESTAMP
       WHERE id = ? AND pairing_code = ? AND status = 'pending'`,
      [tokenHash, id, code]
    );
    return result.affectedRows === 1;
  }

  private async findActiveByTokenHash(tokenHash: string): Promise<Device | null> {
    if (MOCK_MODE) return this.mockService.findActiveByTokenHash(tokenHash);

    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM devices WHERE token_hash = ? AND status = 'active'`,
      [tokenHash]
    );
    return (rows[0] as Device) || null;
  }

  private async touch(id: number): Promise<void> {
    if (MOCK_MODE) return this.mockService.touch(id);

    await db.execute('UPDATE devices SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  }
}
