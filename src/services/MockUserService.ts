import { User } from '../types';
import { comparePassword, hashPassword } from '../utils/auth';
import { mockUsers, mockDelay, MOCK_MODE } from '../utils/mock-database';

export class MockUserService {
  async findById(id: number): Promise<User | null> {
    if (!MOCK_MODE) return null;
    
    await mockDelay();
    const user = mockUsers.find(u => u.id === id);
    
    if (user) {
      console.log(`[MOCK] User found: ${user.email}`);
      return user as unknown as User;
    }
    
    return null;
  }

  async findByEmail(email: string): Promise<User | null> {
    if (!MOCK_MODE) return null;
    
    await mockDelay();
    const user = mockUsers.find(u => u.email === email);
    
    if (user) {
      console.log(`[MOCK] User found by email: ${user.email}`);
      return user as unknown as User;
    }
    
    return null;
  }

  async validatePassword(email: string, password: string): Promise<User | null> {
    if (!MOCK_MODE) return null;
    
    await mockDelay();
    const user = await this.findByEmail(email);
    if (!user) {
      console.log(`[MOCK] Login attempt for non-existent user: ${email}`);
      return null;
    }

    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) {
      console.log(`[MOCK] Invalid password for user: ${email}`);
      return null;
    }

    console.log(`[MOCK] Password validated for user: ${email}`);
    return user;
  }

  async createUser(userData: any): Promise<User> {
    if (!MOCK_MODE) throw new Error('Mock mode not enabled');
    
    await mockDelay();
    
    // 2026-10-03 23:06, hash like the real service (was storing the plain password, so mock signups couldn't log in)
    const { password, ...rest } = userData;
    const newUser = {
      id: Math.max(...mockUsers.map(u => u.id)) + 1,
      ...rest,
      password_hash: await hashPassword(password),
      status: 'active',
      created_at: new Date(),
      updated_at: new Date()
    } as User;
    
    mockUsers.push(newUser as any);
    console.log(`[MOCK] User created: ${newUser.email}`);
    return newUser;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | null> {
    if (!MOCK_MODE) return null;
    
    await mockDelay();
    const userIndex = mockUsers.findIndex(u => u.id === id);
    
    if (userIndex === -1) return null;
    
    mockUsers[userIndex] = { ...mockUsers[userIndex], ...updates, updated_at: new Date() } as any;
    console.log(`[MOCK] User updated: ${mockUsers[userIndex].email}`);
    return mockUsers[userIndex] as unknown as User;
  }
}