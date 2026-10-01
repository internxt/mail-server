import {
  createParamDecorator,
  type ExecutionContext,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';

const CLIENT_CLOSED_REQUEST = 499;

export class ClientClosedRequestError extends HttpException {
  constructor() {
    super('Client closed request', CLIENT_CLOSED_REQUEST);
    this.name = 'ClientClosedRequestError';

    Object.setPrototypeOf(this, ClientClosedRequestError.prototype);
  }
}

/**
 * An AbortSignal that fires when the client goes away before the response is
 * fully written, so upstream work started for it can be cancelled. Listens on
 * the response: the request emits 'close' as soon as its body is consumed.
 */
export function requestSignalFactory(
  _data: unknown,
  ctx: ExecutionContext,
): AbortSignal {
  const res = ctx.switchToHttp().getResponse<Response>();
  const controller = new AbortController();

  res.once('close', () => {
    if (!res.writableFinished) controller.abort(new ClientClosedRequestError());
  });

  return controller.signal;
}

export const RequestSignal = createParamDecorator(requestSignalFactory);
