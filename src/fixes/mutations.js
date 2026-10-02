import { gql, assertNoUserErrors } from '../lib/shopify.js';

export async function productUpdate(product) {
  const d = await gql(`
    mutation Update($product: ProductUpdateInput!) {
      productUpdate(product: $product) { product { id handle } userErrors { field message } }
    }`, { product });
  assertNoUserErrors(d.productUpdate, 'productUpdate');
  return d.productUpdate.product;
}

export async function tagsAdd(id, tags) {
  const d = await gql(`
    mutation Add($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { field message } } }`, { id, tags });
  assertNoUserErrors(d.tagsAdd, 'tagsAdd');
}

export async function tagsRemove(id, tags) {
  const d = await gql(`
    mutation Remove($id: ID!, $tags: [String!]!) { tagsRemove(id: $id, tags: $tags) { userErrors { field message } } }`, { id, tags });
  assertNoUserErrors(d.tagsRemove, 'tagsRemove');
}

/** Sets alt text on product images. Tries fileUpdate first, falls back to productUpdateMedia on older setups. */
export async function setImageAlt(productId, mediaId, alt) {
  try {
    const d = await gql(`
      mutation Alt($files: [FileUpdateInput!]!) { fileUpdate(files: $files) { files { id } userErrors { field message } } }`,
    { files: [{ id: mediaId, alt }] });
    assertNoUserErrors(d.fileUpdate, 'fileUpdate');
  } catch (err) {
    const d = await gql(`
      mutation Media($productId: ID!, $media: [UpdateMediaInput!]!) {
        productUpdateMedia(productId: $productId, media: $media) { media { id } mediaUserErrors { field message } }
      }`, { productId, media: [{ id: mediaId, alt }] }).catch(() => { throw err; });
    const errs = d.productUpdateMedia?.mediaUserErrors || [];
    if (errs.length) throw new Error(errs.map((e) => e.message).join('; '));
  }
}
