import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SchoolController } from './school.controller';
import { SchoolService } from './school.service';

// AuthModule for the password hasher and the session revoker: adding a
// teacher and disabling one use the same machinery every other account does,
// rather than a second implementation here.
@Module({
  imports: [AuthModule],
  controllers: [SchoolController],
  providers: [SchoolService],
})
export class SchoolModule {}
