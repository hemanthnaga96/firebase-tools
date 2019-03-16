import * as _ from "lodash";

import * as api from "../api";
import * as logger from "../logger";
import * as utils from "../utils";

const API_VERSION = "v1";

function _handleErrorResponse(response: any): any {
  if (response.body && response.body.error) {
    return utils.reject(response.body.error, { code: 2 });
  }

  logger.debug("[rules] error:", response.status, response.body);
  return utils.reject("Unexpected error encountered with rules.", {
    code: 2,
  });
}

/**
 * Gets the latest ruleset name on the project.
 * @param projectId Project from which you want to get the ruleset.
 * @param service Service for the ruleset (ex: cloud.firestore or firebase.storage).
 * @returns Name of the latest ruleset.
 */
export async function getLatestRulesetName(
  projectId: string,
  service: string
): Promise<string | null> {
  const response = await api.request("GET", `/${API_VERSION}/projects/${projectId}/releases`, {
    auth: true,
    origin: api.rulesOrigin,
  });
  if (response.status === 200) {
    if (response.body.releases && response.body.releases.length > 0) {
      const releases = _.orderBy(response.body.releases, ["updateTime"], ["desc"]);

      const prefix = "projects/" + projectId + "/releases/" + service;
      const release = _.find(releases, (r) => {
        return r.name.indexOf(prefix) === 0;
      });

      if (!release) {
        return null;
      }
      return release.rulesetName;
    }

    // In this case it's likely that Firestore has not been used on this project before.
    return null;
  }

  return _handleErrorResponse(response);
}

export interface RulesetFile {
  name: string;
  content: string;
}
/**
 * Gets the full contents of a ruleset.
 * @param name Name of the ruleset.
 * @return Array of files in the ruleset. Each entry has form { content, name }.
 */
export async function getRulesetContent(name: string): Promise<RulesetFile[]> {
  const response = await api.request("GET", `/${API_VERSION}/${name}`, {
    auth: true,
    origin: api.rulesOrigin,
  });
  if (response.status === 200) {
    return response.body.source.files;
  }

  return _handleErrorResponse(response);
}

/**
 * Lists the ruleset names on the project.
 * @param projectId Project from which you want to get the ruleset.
 * @returns ruleset names
 */
export async function listRulesets(projectId: string, pageToken?: string): Promise<PageOfRulesets> {
  const response = await api
    .request("GET", `/${API_VERSION}/projects/${projectId}/rulesets`, {
      auth: true,
      origin: api.rulesOrigin,
      query: {
        pageToken,
      },
    });
    if (response.status === 200) {
      return response.body;
    }
    return _handleErrorResponse(response);
}

export interface PageOfRulesets {
  rulesets: object[];
  nextPageToken?: string;
}


/**
 * Creates a new ruleset which can then be associated with a release.
 * @param projectId Project on which you want to create the ruleset.
 * @param {Array} files Array of `{name, content}` for the source files.
 */
export async function createRuleset(projectId: string, files: string): Promise<any> {
  const payload = { source: { files } };

  const response = await api.request("POST", `/${API_VERSION}/projects/${projectId}/rulesets`, {
    auth: true,
    data: payload,
    origin: api.rulesOrigin,
  });
  if (response.status === 200) {
    logger.debug("[rules] created ruleset", response.body.name);
    return response.body.name;
  }

  return _handleErrorResponse(response);
}

/**
 * Create a new named release with the specified ruleset.
 * @param projectId Project on which you want to create the ruleset.
 * @param rulesetName The unique identifier for the ruleset you want to release.
 * @param releaseName The name (e.g. `firebase.storage`) of the release you want to create.
 */
export async function createRelease(
  projectId: string,
  rulesetName: string,
  releaseName: string
): Promise<any> {
  const payload = {
    name: `projects/${projectId}/releases/${releaseName}`,
    rulesetName,
  };

  const response = await api.request("POST", `/${API_VERSION}/projects/${projectId}/releases`, {
    auth: true,
    data: payload,
    origin: api.rulesOrigin,
  });
  if (response.status === 200) {
    logger.debug("[rules] created release", response.body.name);
    return response.body.name;
  }

  return _handleErrorResponse(response);
}

/**
 * Update an existing release with the specified ruleset.
 * @param projectId Project on which you want to create the ruleset.
 * @param rulesetName The unique identifier for the ruleset you want to release.
 * @param releaseName The name (e.g. `firebase.storage`) of the release you want to update.
 */
export async function updateRelease(
  projectId: string,
  rulesetName: string,
  releaseName: string
): Promise<any> {
  const payload = {
    release: {
      name: `projects/${projectId}/releases/${releaseName}`,
      rulesetName,
    },
  };

  const response = await api.request(
    "PATCH",
    `/${API_VERSION}/projects/${projectId}/releases/${releaseName}`,
    {
      auth: true,
      data: payload,
      origin: api.rulesOrigin,
    }
  );
  if (response.status === 200) {
    logger.debug("[rules] updated release", response.body.name);
    return response.body.name;
  }

  return _handleErrorResponse(response);
}

export async function updateOrCreateRelease(
  projectId: string,
  rulesetName: string,
  releaseName: string
): Promise<any> {
  logger.debug("[rules] releasing", releaseName, "with ruleset", rulesetName);
  return updateRelease(projectId, rulesetName, releaseName).catch(() => {
    logger.debug("[rules] ruleset update failed, attempting to create instead");
    return createRelease(projectId, rulesetName, releaseName);
  });
}

export function testRuleset(projectId: string, files: any): Promise<any> {
  return api.request("POST", `/${API_VERSION}/projects/${encodeURIComponent(projectId)}:test`, {
    origin: api.rulesOrigin,
    data: {
      source: { files },
    },
    auth: true,
  });
}
