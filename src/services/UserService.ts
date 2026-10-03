import { RowDataPacket } from 'mysql2';
import { db } from '../utils/database';
import { User } from '../types';
import { hashPassword, comparePassword } from '../utils/auth';
import { MockUserService } from './MockUserService';
import { MOCK_MODE } from '../utils/mock-database';
import { pickAllowedFields, buildSetClause, USER_UPDATE_FIELDS } from '../utils/sql';

export class UserService {
  private mockService = new MockUserService();

  async findById(id: number): Promise<User | null> {
    if (MOCK_MODE) {
      return this.mockService.findById(id);
    }
    
    try {
      const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM users WHERE id = ? AND status = "active"',
        [id]
      );

      if (rows.length === 0) {
        return null;
      }

      const user = rows[0] as User;
      console.log(`User found: ${user.email}`);
      return user;
    } catch (error) {
      console.error('Error finding user by ID:', error);
      throw new Error('Database error');
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    if (MOCK_MODE) {
      return this.mockService.findByEmail(email);
    }
    
    try {
      const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM users WHERE email = ? AND status = "active"',
        [email]
      );

      if (rows.length === 0) {
        return null;
      }

      const user = rows[0] as User;
      console.log(`User found by email: ${user.email}`);
      return user;
    } catch (error) {
      console.error('Error finding user by email:', error);
      throw new Error('Database error');
    }
  }

  async createUser(userData: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    role: 'super_admin' | 'company_admin';
    company_id?: number;
  }): Promise<User> {
    if (MOCK_MODE) {
      return this.mockService.createUser(userData);
    }
    
    try {
      const hashedPassword = await hashPassword(userData.password);

      const [result] = await db.execute(
        `INSERT INTO users (email, password_hash, first_name, last_name, role, company_id, status) 
         VALUES (?, ?, ?, ?, ?, ?, 'active')`,
        [
          userData.email,
          hashedPassword,
          userData.first_name,
          userData.last_name,
          userData.role,
          userData.company_id || null
        ]
      );

      const insertResult = result as any;
      const newUser = await this.findById(insertResult.insertId);
      
      if (!newUser) {
        throw new Error('Failed to create user');
      }

      console.log(`User created: ${newUser.email}`);
      return newUser;
    } catch (error) {
      console.error('Error creating user:', error);
      throw new Error('Failed to create user');
    }
  }

  async validatePassword(email: string, password: string): Promise<User | null> {
    if (MOCK_MODE) {
      return this.mockService.validatePassword(email, password);
    }
    
    try {
      const user = await this.findByEmail(email);
      if (!user) {
        console.log(`Login attempt for non-existent user: ${email}`);
        return null;
      }

      const isValid = await comparePassword(password, user.password_hash);
      if (!isValid) {
        console.log(`Invalid password for user: ${email}`);
        return null;
      }

      // Update last login
      await db.execute(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
        [user.id]
      );

      console.log(`Password validated for user: ${email}`);
      return user;
    } catch (error) {
      console.error('Error validating password:', error);
      throw new Error('Authentication failed');
    }
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | null> {
    try {
      // 2026-10-03 11:34, whitelist columns (SQL injection fix)
      const fields = pickAllowedFields(updates, USER_UPDATE_FIELDS);
      if (Object.keys(fields).length === 0) {
        return this.findById(id);
      }

      const { setClause, values } = buildSetClause(fields);

      await db.execute(
        `UPDATE users SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...values, id]
      );

      const updatedUser = await this.findById(id);
      console.log(`User updated: ${updatedUser?.email}`);
      return updatedUser;
    } catch (error) {
      console.error('Error updating user:', error);
      throw new Error('Failed to update user');
    }
  }
}