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
