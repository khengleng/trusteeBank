import { Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserAuthService } from '../../infra/user-auth.service';

class LoginDto {
  @IsString() @IsNotEmpty() email!: string;
  @IsString() @IsNotEmpty() password!: string;
  @IsOptional() @IsString() code?: string;
}
class CodeDto {
  @IsString() @IsNotEmpty() code!: string;
}
class ChangePasswordDto {
  @IsString() @IsNotEmpty() currentPassword!: string;
  @IsString() @IsNotEmpty() newPassword!: string;
}
class ForgotPasswordDto {
  @IsString() @IsNotEmpty() email!: string;
}
class ResetPasswordDto {
  @IsString() @IsNotEmpty() token!: string;
  @IsString() @IsNotEmpty() newPassword!: string;
}

/**
 * User login for the trustee admin console (§8): password + TOTP MFA. Open
 * namespace (`/api/v1/auth`) so unauthenticated users can obtain a session; MFA
 * setup/enable require a valid Bearer token.
 */
@ApiTags('auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly userAuth: UserAuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Login with email + password (+ MFA code if enabled)' })
  login(@Body() dto: LoginDto) {
    return this.userAuth.login(dto.email, dto.password, dto.code);
  }

  @Get('me')
  @ApiOperation({ summary: 'Current session principal' })
  me(@Headers('authorization') authz?: string) {
    const p = this.principal(authz);
    return { userId: p.userId, email: p.email, institution: p.institution, roles: p.roles };
  }

  @Post('mfa/setup')
  @ApiOperation({ summary: 'Begin TOTP MFA enrollment (returns otpauth URL)' })
  setup(@Headers('authorization') authz?: string) {
    return this.userAuth.setupMfa(this.principal(authz).userId);
  }

  @Post('mfa/enable')
  @ApiOperation({ summary: 'Confirm and enable TOTP MFA' })
  enable(@Body() dto: CodeDto, @Headers('authorization') authz?: string) {
    return this.userAuth.enableMfa(this.principal(authz).userId, dto.code);
  }

  @Post('change-password')
  @ApiOperation({ summary: 'Change your password (requires current password)' })
  changePassword(@Body() dto: ChangePasswordDto, @Headers('authorization') authz?: string) {
    return this.userAuth.changePassword(this.principal(authz).userId, dto.currentPassword, dto.newPassword);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password-reset email (§8)' })
  forgot(@Body() dto: ForgotPasswordDto) {
    return this.userAuth.requestPasswordReset(dto.email);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with an emailed token' })
  reset(@Body() dto: ResetPasswordDto) {
    return this.userAuth.resetPassword(dto.token, dto.newPassword);
  }

  private principal(authz?: string) {
    const token = authz?.startsWith('Bearer ') ? authz.slice(7).trim() : '';
    const p = token ? this.userAuth.verifyToken(token) : null;
    if (!p) throw new UnauthorizedException('Valid session token required');
    return p;
  }
}
