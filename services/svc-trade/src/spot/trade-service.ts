import { createHash } from 'node:crypto';
import type { Sql } from 'postgres';
import { transaction } from '@intafaced/db';
import type { Timeframe } from '@intafaced/exchange-contract';
import type { EventBus } from '@intafaced/events';
