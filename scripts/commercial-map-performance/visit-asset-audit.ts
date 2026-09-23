import { auditVisitCartFallback } from '../../src/features/commercial-map/visit/vehicles/VisitCartModel';
import { auditVisitHelicopterFallback } from '../../src/features/commercial-map/visit/vehicles/VisitHelicopterModel';

const cart = auditVisitCartFallback();
const helicopter = auditVisitHelicopterFallback();
const passed = cart.triangles <= 20_000 && cart.drawCalls <= 28 && cart.textures <= 1
  && helicopter.triangles <= 32_000 && helicopter.drawCalls <= 32 && helicopter.textures <= 1;
console.log(JSON.stringify({ cart, helicopter, budgets: { cart: { triangles: 20_000, drawCalls: 28, textures: 1 },
  helicopter: { triangles: 32_000, drawCalls: 32, textures: 1 } }, passed }, null, 2));
if (!passed) process.exitCode = 1;
