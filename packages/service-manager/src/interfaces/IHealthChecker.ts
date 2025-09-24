import type { ServiceInstance } from '../types.js';

export interface IHealthChecker {
  startHealthChecks(service: ServiceInstance): void;
  stopHealthChecks(serviceId: string): void;
  checkHealth(service: ServiceInstance): Promise<boolean>;
}