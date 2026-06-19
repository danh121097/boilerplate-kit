import { ZodValidationPipe } from "nestjs-zod";

/**
 * Re-export nestjs-zod's ZodValidationPipe for use as APP_PIPE provider.
 * nestjs-zod v5.4.0 ships ZodValidationPipe directly — no factory call needed
 * for the default configuration. Registered globally via CommonModule providers.
 */
export { ZodValidationPipe };
