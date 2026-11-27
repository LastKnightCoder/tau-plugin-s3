# S3 Sync Storage

Sync your Tau notes, conversations, and attachments to S3-compatible storage such as AWS S3, Cloudflare R2, or MinIO, so you can access the same library across desktop and mobile devices. Private buckets work out of the box without enabling public access.

## Getting Started

1. Install **S3 Sync Storage** from the Plugin Center, then enable it under **Installed** on the Plugins page.
2. Open **Settings** on the plugin details page.
3. Fill in **Access Key ID**, **Secret Access Key**, **Bucket**, and **Region**. For S3-compatible services such as R2 or MinIO, also fill in **Service endpoint**. If your provider requires a specific **Addressing style**, select it according to their documentation. **Directory** is optional.
4. Save and test the connection, then go to **Settings → Sync** and select this service to check status, upload, download, or enable automatic sync. Saving settings does not automatically switch your active sync service.

## FAQ

**Permission denied?** Verify that your access keys are correct, that they have read and write permissions for the bucket, and that **Service endpoint** and **Region** are entered accurately.

**Error saying the storage service does not support a write mode?** This means the provider is not fully compatible with Tau's sync mechanism. To protect your data from being overwritten, sync stops automatically instead of forcing a write. Please note the error message and report it to us.

**Can multiple libraries share the same storage location?** No. Use a separate storage location for each library (you can separate them using **Directory**), otherwise data will overwrite each other.

**Does disabling the plugin delete my data?** No. Both your settings and synced data stay intact and work again once you re-enable the plugin. You cannot disable or uninstall the plugin while a sync is in progress; wait until it finishes first.

## Notes

- Works on desktop and mobile. If you also use the asset upload plugin, sync and upload credentials are configured separately and do not affect each other.
- Your access keys are the keys to your storage. Never share them with others or include them in screenshots or issue reports.
