// 2026-10-03 11:39, mock implementation of DeviceService (MOCK_DATABASE=true)
import { Device } from '../types';
import { mockDevices, mockDelay, MOCK_MODE } from '../utils/mock-database';

export class MockDeviceService {
  async createPending(propertyId: number, name: string | undefined, pairingCode: string, expiresAt: Date): Promise<Device> {
    if (!MOCK_MODE) throw new Error('Mock mode not enabled');

    await mockDelay(50);
    const device: Device = {
      id: mockDevices.length ? Math.max(...mockDevices.map(d => d.id)) + 1 : 1,
      property_id: propertyId,
      type: 'tablet',
      name,
      token_hash: null,
      pairing_code: pairingCode,
      pairing_expires_at: expiresAt,
      last_seen_at: null,
      status: 'pending',
      created_at: new Date()
    };
    mockDevices.push(device);
    console.log(`[MOCK] Pending device created for property ${propertyId}`);
    return device;
  }

  async findPendingByCode(pairingCode: string): Promise<Device | null> {
    if (!MOCK_MODE) return null;

    await mockDelay(50);
    return mockDevices.find(d =>
      d.status === 'pending' &&
      d.pairing_code === pairingCode &&
      d.pairing_expires_at > new Date()
    ) || null;
  }

  async activate(id: number, tokenHash: string): Promise<void> {
    if (!MOCK_MODE) return;

    const device = mockDevices.find(d => d.id === id);
    if (device) {
      Object.assign(device, {
        token_hash: tokenHash,
        pairing_code: null,
        pairing_expires_at: null,
        status: 'active',
        last_seen_at: new Date()
      });
    }
  }

  async findActiveByTokenHash(tokenHash: string): Promise<Device | null> {
    if (!MOCK_MODE) return null;

    return mockDevices.find(d => d.status === 'active' && d.token_hash === tokenHash) || null;
  }

  async touch(id: number): Promise<void> {
    if (!MOCK_MODE) return;

    const device = mockDevices.find(d => d.id === id);
    if (device) device.last_seen_at = new Date();
  }

  async listByProperty(propertyId: number): Promise<Device[]> {
    if (!MOCK_MODE) return [];

    await mockDelay(50);
    return mockDevices.filter(d => d.property_id === propertyId && d.status !== 'revoked');
  }

  async revoke(id: number, propertyId: number): Promise<boolean> {
    if (!MOCK_MODE) return false;

    const device = mockDevices.find(d => d.id === id && d.property_id === propertyId && d.status !== 'revoked');
    if (!device) return false;
    Object.assign(device, { status: 'revoked', token_hash: null, pairing_code: null });
    console.log(`[MOCK] Device ${id} revoked`);
    return true;
  }
}
