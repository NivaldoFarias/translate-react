import { ptBrLocaleMechanicalRepairs } from "./definition";

export * from "./definition";

/**
 * Applies Brazilian Portuguese locale mechanical repairs.
 *
 * @param content Assembled translated markdown
 *
 * @returns Document unchanged until prod-validated `pt-br` repairs are registered
 */
export function applyPtBrLocaleMechanicalRepairs(content: string) {
	return ptBrLocaleMechanicalRepairs.apply(content);
}
