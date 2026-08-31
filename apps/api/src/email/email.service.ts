import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Sends e-mail through Resend.
 *
 * Resend has an official package, and this uses its HTTP API directly instead.
 * The whole of what this platform sends is one message with a link in it: a
 * dependency, its updates and its own dependencies would be a larger thing to
 * maintain than the fifteen lines below (client's standing instruction:
 * the simplest approach that can be maintained).
 *
 * Without a key configured — which is every developer machine and the test
 * runs — nothing is sent and the link is written to the log instead. Recovery
 * can then be walked through end to end locally without an account anywhere,
 * and, more importantly, a missing key in production is loud in the log rather
 * than a silent failure that looks like a working reset.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  /** Whether a real send is possible. False on a machine with no key. */
  get isConfigured(): boolean {
    return Boolean(this.config.get<string>('RESEND_API_KEY'));
  }

  /**
   * Sends one message, and never throws.
   *
   * A failure to send must not be reported to the person asking. Telling her
   * "we could not send to that address" answers whether the address has an
   * account, which is the one thing the recovery route is careful not to say.
   */
  async send(to: string, subject: string, text: string): Promise<boolean> {
    const key = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('EMAIL_FROM') ?? 'TOP GOAL <noreply@example.com>';

    if (!key) {
      this.logger.warn(
        `No RESEND_API_KEY is set, so no e-mail was sent. It would have gone to ${to}: ${text}`,
      );
      return false;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to, subject, text }),
      });

      if (!response.ok) {
        // The body can name the address, so only the status is logged.
        this.logger.error(`Resend refused the message (${response.status}).`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`Could not reach Resend: ${(error as Error).message}`);
      return false;
    }
  }
}
