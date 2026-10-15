import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { Instrument } from './Instrument.js';
import { User } from './User.js';

const decimalTransformer = {
  from: (value: string | null): string | null => value,
  to: (value: string): string => value,
};

@Entity({ name: 'orders' })
export class Order {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'instrumentid', type: 'int' })
  instrumentId!: number;

  @Column({ name: 'userid', type: 'int' })
  userId!: number;

  @Column({ type: 'int' })
  size!: number;

  @Column({ type: 'numeric', nullable: true, transformer: decimalTransformer })
  price!: string | null;

  @Column({ type: 'varchar' })
  side!: string;

  @Column({ type: 'varchar' })
  status!: string;

  @Column({ type: 'varchar' })
  type!: string;

  @Column({ type: 'timestamp' })
  datetime!: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userid' })
  user!: User;

  @ManyToOne(() => Instrument)
  @JoinColumn({ name: 'instrumentid' })
  instrument!: Instrument;
}
