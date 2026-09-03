import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/** PostgreSQL's code for "you are not allowed to do that". */
const INSUFFICIENT_PRIVILEGE = '42501';

/**
 * Row-level security refused the query, so the caller is told the row is not
 * there.
 *
 * A refusal from the database is the last barrier rather than the first: the
 * services scope their own queries, and reaching this filter means one of them
 * missed something. What matters here is what the caller learns. An unhandled
 * refusal left the API answering 500, and a 500 is an answer: it separates
 * "this row exists but is not yours" from the 404 an address with nothing
 * behind it returns, which is exactly the distinction a stranger probing for
 * another school's content is looking for. Both now read the same.
 *
 * The refusal is logged in full on the way past, because a policy stopping
 * something the application should have stopped first is a defect worth
 * seeing.
 */
@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientUnknownRequestError)
export class RlsDenialFilter implements ExceptionFilter {
  private readonly logger = new Logger(RlsDenialFilter.name);

  catch(
    exception:
      | Prisma.PrismaClientKnownRequestError
      | Prisma.PrismaClientUnknownRequestError,
    host: ArgumentsHost,
  ): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (!RlsDenialFilter.isPolicyRefusal(exception)) {
      // Nothing to do with tenancy. Answer as the framework would have.
      this.logger.error(exception.message, exception.stack);
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      });
      return;
    }

    this.logger.error(
      `Row-level security refused a query that the application should have scoped first: ${exception.message}`,
      exception.stack,
    );

    response.status(HttpStatus.NOT_FOUND).json({
      statusCode: HttpStatus.NOT_FOUND,
      error: 'Not Found',
      message: 'Not found.',
    });
  }

  /**
   * Whether the database refused this on policy grounds.
   *
   * Matched on what PostgreSQL said rather than on Prisma's own code, which
   * varies by the shape of the query that tripped the policy: an insert
   * refused by a WITH CHECK and a delete refused by a USING clause arrive
   * differently, and both are the same answer to the caller.
   */
  private static isPolicyRefusal(exception: {
    message: string;
    meta?: Record<string, unknown>;
  }): boolean {
    if (exception.meta?.code === INSUFFICIENT_PRIVILEGE) return true;

    const message = exception.message.toLowerCase();
    return (
      message.includes('row-level security') ||
      message.includes(`code: "${INSUFFICIENT_PRIVILEGE}"`)
    );
  }
}
