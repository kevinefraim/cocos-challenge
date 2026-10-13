import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

import { MarketData } from './MarketData.js';
import { Order } from './Order.js';

@Entity({ name: 'instruments' })
export class Instrument {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar' })
  ticker!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar' })
  type!: string;

  @OneToMany(() => Order, (order) => order.instrument)
  orders!: Order[];

  @OneToMany(() => MarketData, (marketData) => marketData.instrument)
  marketData!: MarketData[];
}
