import 'reflect-metadata';
import './utc-timestamps.js';
import { DataSource } from 'typeorm';

import { env } from '../config/env.js';
import { Instrument } from './entities/Instrument.js';
import { MarketData } from './entities/MarketData.js';
import { Order } from './entities/Order.js';
import { User } from './entities/User.js';

export const appDataSource = new DataSource({
  type: 'postgres',
  url: env.DATABASE_URL,
  entities: [User, Instrument, Order, MarketData],
  synchronize: false,
  logging: false,
  ssl: env.DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});
