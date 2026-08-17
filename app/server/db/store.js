import * as userRepository from "./repositories/users.js";
import * as jobRepository from "./repositories/jobs.js";
import * as assetRepository from "./repositories/assets.js";
import * as creditRepository from "./repositories/credits.js";

/**
 * Stable application data boundary. Route handlers and workers use this object
 * rather than issuing ad-hoc SQL, which keeps tenant ownership checks centralized.
 */
export const store = Object.freeze({
  users: Object.freeze({ ...userRepository }),
  jobs: Object.freeze({ ...jobRepository }),
  assets: Object.freeze({ ...assetRepository }),
  credits: Object.freeze({ ...creditRepository }),
});

export default store;
