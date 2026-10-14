export function assetGraphHref(assetId: string): string {
  return `/assets?section=map&view=graph&asset_id=${encodeURIComponent(assetId)}`;
}
