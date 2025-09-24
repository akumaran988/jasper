import type { ServiceInstance } from '../types.js';

export interface IServiceRepository {
  save(service: ServiceInstance): Promise<void>;
  findById(id: string): Promise<ServiceInstance | null>;
  findAll(): Promise<ServiceInstance[]>;
  delete(id: string): Promise<void>;
  update(service: ServiceInstance): Promise<void>;
}