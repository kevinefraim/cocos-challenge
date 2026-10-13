import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

import { Order } from './Order.js';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar' })
  email!: string;

  @Column({ name: 'accountnumber', type: 'varchar' })
  accountNumber!: string;

  @OneToMany(() => Order, (order) => order.user)
  orders!: Order[];
}
