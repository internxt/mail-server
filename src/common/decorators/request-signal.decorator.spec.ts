import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ExecutionContext } from '@nestjs/common';
import {
  ClientClosedRequestError,
  requestSignalFactory,
} from './request-signal.decorator.js';

function contextFor(res: EventEmitter): ExecutionContext {
  return {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ExecutionContext;
}

function fakeResponse(writableFinished: boolean) {
  return Object.assign(new EventEmitter(), { writableFinished });
}

describe('Request signal', () => {
  it('when the client disconnects before the response is complete, then the signal aborts', () => {
    const res = fakeResponse(false);
    const signal = requestSignalFactory(undefined, contextFor(res));

    res.emit('close');

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBeInstanceOf(ClientClosedRequestError);
  });

  it('when the response completes normally, then the signal does not abort', () => {
    const res = fakeResponse(true);
    const signal = requestSignalFactory(undefined, contextFor(res));

    res.emit('close');

    expect(signal.aborted).toBe(false);
  });
});
