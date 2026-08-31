import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';

/**
 * Sending e-mail.
 *
 * Global because recovery is not the only thing that will ever need it, and a
 * service with no state and one method is not worth wiring into each module
 * that wants it.
 */
@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
