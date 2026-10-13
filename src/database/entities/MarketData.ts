import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { Instrument } from './Instrument.js';

const decimalTransformer = {
  from: (value: string | null): string | null => value,
  to: (value: string): string => value,
};

@Entity({ name: 'marketdata' })
export class MarketData {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'instrumentid', type: 'int' })
  instrumentId!: number;

  @Column({ type: 'numeric', nullable: true, transformer: decimalTransformer })
  high!: string | null;

  @Column({ type: 'numeric', nullable: true, transformer: decimalTransformer })
  low!: string | null;

  @Column({ type: 'numeric', nullable: true, transformer: decimalTransformer })
  open!: string | null;

  @Column({ type: 'numeric', transformer: decimalTransformer })
  close!: string;

  @Column({ name: 'previousclose', type: 'numeric', transformer: decimalTransformer })
  previousClose!: string;

  @Column({ type: 'date' })
  date!: string;

  @ManyToOne(() => Instrument, (instrument) => instrument.marketData)
  @JoinColumn({ name: 'instrumentid' })
  instrument!: Instrument;
}
