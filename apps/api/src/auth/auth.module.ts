import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { RecoveryService } from './recovery.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');

        if (!secret || secret.length < 32) {
          // Failing at startup is far better than running with a guessable
          // secret that lets anyone mint their own valid tokens.
          throw new Error(
            'JWT_SECRET must be set to at least 32 characters. See .env.example.',
          );
        }

        return { secret };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, RecoveryService],
  // JwtModule is exported because the global JwtAuthGuard is registered in
  // AppModule and needs JwtService from there.
  exports: [AuthService, PasswordService, TokenService, RecoveryService, JwtModule],
})
export class AuthModule {}
