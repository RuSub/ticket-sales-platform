import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { prisma } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  async register(email: string, password: string, fullName?: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, fullName, role: UserRole.BUYER },
      select: { id: true, email: true, role: true, fullName: true },
    });

    const tokens = await this.getTokens(user.id, user.role);
    return { user, ...tokens };
  }

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is blocked');
    }

    const tokens = await this.getTokens(user.id, user.role);
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

      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, role: true, fullName: true, isActive: true },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const tokens = await this.getTokens(user.id, user.role);
      return tokens;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getTokens(userId: string, role: UserRole) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, role },
        { secret: process.env.JWT_SECRET, expiresIn: Number(process.env.JWT_EXPIRATION) || 900 },
      ),
      this.jwtService.signAsync(
        { sub: userId },
        { secret: process.env.REFRESH_TOKEN_SECRET, expiresIn: Number(process.env.REFRESH_TOKEN_EXPIRATION) || 604800 },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  async validateOAuthUser(email: string, fullName?: string) {
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: { email, passwordHash: '', fullName, role: UserRole.BUYER },
      });
    }

    if (!user) {
      throw new UnauthorizedException('OAuth user not found');
    }

    const tokens = await this.getTokens(user.id, user.role);
    return {
      user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName },
      ...tokens,
    };
  }
}
