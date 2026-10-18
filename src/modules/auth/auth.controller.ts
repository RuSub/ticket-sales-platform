import { Body, Controller, Post, UseGuards, Req, Get, Patch, Redirect, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LocalAuthGuard } from './local-auth.guard';
import { GoogleAuthGuard } from './google-auth.guard';
import { Roles } from '../../decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() body: { email: string; password: string; fullName?: string }) {
    return this.authService.register(body.email, body.password, body.fullName);
  }

  @Post('login')
  @UseGuards(LocalAuthGuard)
  async login(@Req() req: any) {
    return this.authService.login(req.user.email, req.body.password);
  }

  @Post('refresh')
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: any) {
    return { message: 'Logged out successfully' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@Req() req: any) {
    return req.user;
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(@Req() req: any, @Body() body: { fullName?: string; phone?: string }) {
    return { ...req.user, ...body };
  }

  @Roles(UserRole.ADMIN)
  @Get('admin/users')
  @UseGuards(JwtAuthGuard)
  getUsers(@Req() req: any) {
    return { message: 'Admin users endpoint', users: [] };
  }

  @Get('oauth2/google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth(@Req() req: any) {}

  @Get('oauth2/google/callback')
  @UseGuards(GoogleAuthGuard)
  @Redirect()
  async googleAuthRedirect(@Req() req: any) {
    return { url: `/?accessToken=${req.user.accessToken}` };
  }
}
