import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { developerHubHtml, landingHtml } from '@trustee/portal-ui';
import { loadConfig } from '../../config/configuration';

// Same-origin ('') so the hub's live health + JWKS fetches hit this API host.
const DEVELOPER_HUB = developerHubHtml('');
const LANDING_HTML = landingHtml(loadConfig().urls.trusteePublic);

/**
 * The API gateway (api.trustee.cambobia.com) root is the Developer Hub — auth,
 * client separation, request/webhook signing, the machine-readable contracts,
 * and a live signing-key viewer. The admin console is a separate service
 * (trustee.cambobia.com → `trustee-admin-portal`), keeping the API and admin UI
 * on distinct services and origins (domain config; client-separation).
 */
@Controller()
export class PortalController {
  @Get()
  @ApiExcludeEndpoint()
  @Header('content-type', 'text/html; charset=utf-8')
  root(): string {
    return DEVELOPER_HUB;
  }

  @Get('developers')
  @ApiExcludeEndpoint()
  @Header('content-type', 'text/html; charset=utf-8')
  developers(): string {
    return DEVELOPER_HUB;
  }

  @Get('status')
  @ApiExcludeEndpoint()
  @Header('content-type', 'text/html; charset=utf-8')
  status(): string {
    return LANDING_HTML;
  }
}
