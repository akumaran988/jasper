import { ToolPermissionHandler, ToolCall, PermissionContext, PermissionCheckResult, ScopeInfo } from '../types.js';

export class WebFetchPermissionHandler implements ToolPermissionHandler {
  toolName = 'web_fetch';
  
  generatePermissionKey(toolCall: ToolCall): string {
    if (toolCall.parameters?.url) {
      try {
        const url = new URL(toolCall.parameters.url);
        return `${toolCall.name}:domain:${url.hostname}`;
      } catch {
        // URL parsing failed, fall back to tool-only
      }
    }
    
    return `${toolCall.name}:tool`;
  }
  
  checkPermission(context: PermissionContext): PermissionCheckResult {
    const { toolCall, existingApprovals } = context;
    
    // Check exact key match first
    const exactKey = this.generatePermissionKey(toolCall);
    if (existingApprovals.has(exactKey)) {
      const rule = existingApprovals.get(exactKey)!;
      return {
        allowed: true,
        reason: `Exact permission match: ${exactKey}`,
        matchedRule: rule
      };
    }
    
    // For web requests, check domain matches
    if (toolCall.parameters?.url) {
      try {
        const requestedUrl = new URL(toolCall.parameters.url);
        const requestedDomain = requestedUrl.hostname;
        
        for (const [key, rule] of existingApprovals.entries()) {
          if (rule.toolName === 'web_fetch' && rule.scope === 'domain' && rule.scopeValue) {
            const approvedDomain = rule.scopeValue;
            
            // Check for exact domain match
            if (requestedDomain === approvedDomain) {
              return {
                allowed: true,
                reason: `Domain ${requestedDomain} matches approved domain ${approvedDomain}`,
                matchedRule: rule
              };
            }
            
            // Check for subdomain matches (optional - you might want to make this configurable)
            if (this.isSubdomainOf(requestedDomain, approvedDomain)) {
              return {
                allowed: true,
                reason: `Domain ${requestedDomain} is a subdomain of approved domain ${approvedDomain}`,
                matchedRule: rule
              };
            }
          }
        }
      } catch {
        // URL parsing failed, permission denied
        return { 
          allowed: false, 
          reason: 'Invalid URL format' 
        };
      }
    }
    
    return { allowed: false };
  }
  
  getScopeInfo(toolCall: ToolCall): ScopeInfo {
    if (toolCall.parameters?.url) {
      try {
        const url = new URL(toolCall.parameters.url);
        return {
          scope: 'domain',
          scopeValue: url.hostname,
          description: url.hostname
        };
      } catch {
        // URL parsing failed
      }
    }
    
    return {
      scope: 'tool',
      description: 'all web requests'
    };
  }
  
  getSessionDescription(toolCall: ToolCall): string {
    const scopeInfo = this.getScopeInfo(toolCall);
    return `Yes for this session (${scopeInfo.description})`;
  }
  
  private isSubdomainOf(domain: string, parentDomain: string): boolean {
    // Check if domain is a subdomain of parentDomain
    // e.g., api.example.com is subdomain of example.com
    return domain.endsWith('.' + parentDomain);
  }
}