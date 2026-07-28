export type NowCoderAdapterDesignValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly missing: readonly string[] };

export function validateNowCoderAdapterDesign(
  text: string,
): NowCoderAdapterDesignValidation;
