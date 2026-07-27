import { builtinEnvironments, type Environment } from "vitest/environments";

const nodeEnvironment = builtinEnvironments.node;

const venueSqlNodeEnvironment: Environment = {
  ...nodeEnvironment,
  name: "venue-sql-node",
  async setup(global, options) {
    const hadWindow = Object.prototype.hasOwnProperty.call(global, "window");
    const previousWindow = global.window;
    Object.defineProperty(global, "window", {
      configurable: true,
      writable: true,
      value: {},
    });

    const environment = await nodeEnvironment.setup(global, options);
    return {
      async teardown(context) {
        await environment.teardown(context);
        if (hadWindow) {
          global.window = previousWindow;
        } else {
          delete global.window;
        }
      },
    };
  },
};

export default venueSqlNodeEnvironment;
