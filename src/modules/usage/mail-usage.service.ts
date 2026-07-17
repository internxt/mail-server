import { Injectable, Logger } from '@nestjs/common';
import {
  BridgeApiError,
  BridgeClient,
} from '../infrastructure/bridge/bridge.service.js';
import {
  DuplicateEntryKeyError,
  MailBucketEntryRepository,
} from './repositories/mail-bucket-entry.repository.js';

export interface TrackStoredMessageParams {
  mailAddressId: string;
  userUuid: string;
  bucketId: string;
  entryKey: string;
  size: number;
}

export interface ReleaseStoredMessageParams {
  userUuid: string;
  bucketId: string;
  entryKey: string;
}

@Injectable()
export class MailUsageService {
  private readonly logger = new Logger(MailUsageService.name);

  constructor(
    private readonly entries: MailBucketEntryRepository,
    private readonly bridge: BridgeClient,
  ) {}

  async trackStoredMessage(params: TrackStoredMessageParams): Promise<void> {
    const { mailAddressId, userUuid, bucketId, entryKey, size } = params;

    const existing = await this.entries.findByEntryKey(entryKey);
    if (existing) {
      this.logger.debug({ entryKey }, 'Message already tracked; skipping');
      return;
    }

    const { id: bridgeEntryId, totalUsedSpaceBytes } =
      await this.bridge.createBucketEntry(userUuid, bucketId, size);

    try {
      await this.entries.create({
        mailAddressId,
        entryKey,
        bridgeEntryId,
        size,
      });
    } catch (error) {
      if (error instanceof DuplicateEntryKeyError) {
        this.logger.debug(
          { entryKey, bridgeEntryId },
          'Concurrent tracking detected; rolling back minted bucket entry',
        );
        await this.rollbackBucketEntry(userUuid, bucketId, bridgeEntryId, {
          entryKey,
        });
        return;
      }

      this.logger.error(
        { entryKey, bridgeEntryId, error },
        'Failed to persist tracked message; rolling back minted bucket entry',
      );
      await this.rollbackBucketEntry(userUuid, bucketId, bridgeEntryId, {
        entryKey,
      });
      throw error;
    }

    this.logger.log(
      { entryKey, bridgeEntryId, size, totalUsedSpaceBytes },
      'Tracked stored message',
    );
  }

  async releaseStoredMessage(
    params: ReleaseStoredMessageParams,
  ): Promise<void> {
    const { userUuid, bucketId, entryKey } = params;

    const existing = await this.entries.findByEntryKey(entryKey);
    if (!existing) {
      this.logger.debug(
        { entryKey },
        'No tracked entry for message; skipping release',
      );
      return;
    }

    try {
      await this.bridge.deleteBucketEntry(
        userUuid,
        bucketId,
        existing.bridgeEntryId,
      );
    } catch (error) {
      if (!(error instanceof BridgeApiError && error.statusCode === 404)) {
        throw error;
      }
      this.logger.debug(
        { entryKey, bridgeEntryId: existing.bridgeEntryId },
        'Bridge entry already removed; continuing release',
      );
    }
    await this.entries.deleteByEntryKey(entryKey);

    this.logger.log(
      { entryKey, bridgeEntryId: existing.bridgeEntryId },
      'Released stored message',
    );
  }

  private async rollbackBucketEntry(
    userUuid: string,
    bucketId: string,
    bridgeEntryId: string,
    context: { entryKey: string },
  ): Promise<void> {
    try {
      await this.bridge.deleteBucketEntry(userUuid, bucketId, bridgeEntryId);
    } catch (rollbackError) {
      this.logger.error(
        { ...context, bridgeEntryId, rollbackError },
        'Failed to roll back minted bucket entry; manual reconciliation required',
      );
    }
  }
}
