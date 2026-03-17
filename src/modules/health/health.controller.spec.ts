import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('check', () => {
    it('When called, then it returns status ok', () => {
      expect(controller.check()).toEqual({ status: 'ok' });
    });
  });
});
