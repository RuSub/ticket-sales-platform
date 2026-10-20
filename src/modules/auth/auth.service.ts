import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { prisma } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';

// Keep seconds (JWT_EXPIRATION may be "15m" -> Number() === NaN -> fallback).
const ACCESS_TOKEN_SECONDS = Number(process.env.JWT_EXPIRATION) || 15 * 60;
const REFRESH_TOKEN_SECONDS = Number(process.env.REFRESH_TOKEN_EXPIRATION) || 7 * 24 * 60 * 60;

export const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  role: true,
  fullName: true,
  phone: true,
  isActive: true,
  createdAt: true,
} as const;

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async register(email: string, password: string, fullName?: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email: normalizedEmail, passwordHash, fullName },
      select: PUBLIC_USER_SELECT,
    });

    const tokens = await this.getTokens(user.id, user.role, user.email);
    return { user, ...tokens };
  }

  async validateCredentials(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is blocked');
    }

    return user;
  }

  async login(email: string, password: string) {
    const user = await this.validateCredentials(email, password);
    const tokens = await this.getTokens(user.id, user.role, user.email);

    return {
      user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName },
      ...tokens,
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: process.env.REFRESH_TOKEN_SECRET,
      });

      if (payload?.type !== 'refresh' || !payload.sub) {
        throw new Error('Not a refresh token');
      }

      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, role: true, isActive: true },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return this.getTokens(user.id, user.role, user.email);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getTokens(userId: string, role: UserRole, email: string) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email, role, type: 'access' },
        { secret: process.env.JWT_SECRET, expiresIn: ACCESS_TOKEN_SECONDS },
      ),
      this.jwtService.signAsync(
        { sub: userId, type: 'refresh' },
        { secret: process.env.REFRESH_TOKEN_SECRET, expiresIn: REFRESH_TOKEN_SECONDS },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: PUBLIC_USER_SELECT,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateProfile(userId: string, data: { fullName?: string; phone?: string }) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
      },
      select: PUBLIC_USER_SELECT,
    });
  }

  async listUsers(page = 1, limit = 20) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
        select: PUBLIC_USER_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count(),
    ]);

    return { users, total, page: safePage, totalPages: Math.ceil(total / safeLimit) };
  }

  async validateOAuthUser(email: string, fullName?: string) {
    const normalizedEmail = email.trim().toLowerCase();
    let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          // Random password: OAuth accounts must not be usable via password login.
          passwordHash: await bcrypt.hash(randomUUID(), 12),
          fullName,
          role: UserRole.BUYER,
        },
      });
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is blocked');
    }

    const tokens = await this.getTokens(user.id, user.role, user.email);
    return {
      user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName },
      ...tokens,
    };
  }
}
