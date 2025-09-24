import type { IServiceRepository } from '../interfaces/IServiceRepository.js';
import type { ServiceInstance } from '../types.js';

export class InMemoryServiceRepository implements IServiceRepository {
  private services: Map<string, ServiceInstance> = new Map();

  async save(service: ServiceInstance): Promise<void> {
    this.services.set(service.id, { ...service });
  }

  async findById(id: string): Promise<ServiceInstance | null> {
    const service = this.services.get(id);
    return service ? { ...service } : null;
  }

  async findAll(): Promise<ServiceInstance[]> {
    return Array.from(this.services.values()).map(service => ({ ...service }));
  }

  async delete(id: string): Promise<void> {
    this.services.delete(id);
  }

  async update(service: ServiceInstance): Promise<void> {
    if (!this.services.has(service.id)) {
      throw new Error(`Service not found: ${service.id}`);
    }
    this.services.set(service.id, { ...service });
  }

  async findByName(name: string): Promise<ServiceInstance[]> {
    return Array.from(this.services.values())
      .filter(service => service.name === name)
      .map(service => ({ ...service }));
  }

  async findByStatus(status: ServiceInstance['status']): Promise<ServiceInstance[]> {
    return Array.from(this.services.values())
      .filter(service => service.status === status)
      .map(service => ({ ...service }));
  }

  async count(): Promise<number> {
    return this.services.size;
  }

  async clear(): Promise<void> {
    this.services.clear();
  }

  // Utility methods for debugging and monitoring
  getStats(): { total: number; byStatus: Record<string, number> } {
    const stats = {
      total: this.services.size,
      byStatus: {} as Record<string, number>,
    };

    for (const service of this.services.values()) {
      stats.byStatus[service.status] = (stats.byStatus[service.status] || 0) + 1;
    }

    return stats;
  }
}