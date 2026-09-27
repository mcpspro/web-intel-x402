import { createApp, type Env } from "./app.js";

// En Workers no se pueden compartir promesas de E/S entre peticiones, y el middleware
// x402 sincroniza con el facilitador al construirse. Por eso se crea la app por petición.
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return createApp(env).fetch(request, env, ctx);
  },
};
