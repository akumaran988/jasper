import type { ServiceConfig, ServiceInstance, ServiceStats } from '../types.js';

export interface IServiceProvider {
  readonly type: 'process' | 'docker';
  
  start(service: ServiceInstance): Promise<void>;
  stop(service: ServiceInstance): Promise<void>;
  getStats(service: ServiceInstance): Promise<ServiceStats | null>;
  isRunning(service: ServiceInstance): Promise<boolean>;
  cleanup(service: ServiceInstance): Promise<void>;
}