import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

// AuthModule for the password hasher: creating a school creates the one
// account that can get into it, and that account's password is hashed the
// same way every other one is rather than by a second implementation here.
@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
