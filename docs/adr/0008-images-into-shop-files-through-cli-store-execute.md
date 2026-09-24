# The Studio puts images into the shop's Files through `shopify store execute`

An `image_picker` setting takes an image already in the shop's Files (`shopify://shop_images/<filename>`), and only the Admin API adds one there. ADR-0004 rejected the Admin API because it needed an app, a token and an account. ADR-0006's `shopify store execute` removed those costs: the Shopify CLI holds the auth `shopify store auth` stored, and the Studio never sees a token. So `POST /api/files` (`studio/server/studio.mjs`) takes the absolute path of a local jpg, png, webp or gif of at most 20 MB and runs, each through `store execute`:

1. `stagedUploadsCreate` (resource `IMAGE`, with the file's name, MIME type and size) with `--allow-mutations`, then posts the file to the staged target with the parameters Shopify returned;
2. `fileCreate` with the staged `resourceUrl` as `originalSource`, with `--allow-mutations`;
3. a query on the new file every second until its `fileStatus` is `READY`, or `FAILED` with Shopify's error.

It answers `{"image": "shopify://shop_images/<filename>", "url": "<cdn url>"}`. The filename comes from the CDN URL, since Shopify renames a file whose name is taken.

This supersedes ADR-0004's rejection of an Admin API upload. The Studio logo stays in the Theme's assets for now.

The costs:
- The store auth adds the `write_files` scope: `shopify store auth --store <shop> --scopes read_products,read_online_store_navigation,write_files`. A store authenticated with the older command must be authenticated again; until then the call answers 409 with that command, as `GET /api/store` does without auth.
- The Studio can now write to the store, though only images into Files: `--allow-mutations` is passed only to those two mutations.
- Each step starts the CLI again, so an upload takes a few seconds.

## Considered Options

- **Keep images in the Theme's assets, as the logo does**: rejected for `image_picker` settings, which only take the shop's Files.
- **Send the Creator to Shopify admin to upload, then type the filename**: rejected, as in ADR-0004, for a basic step.
