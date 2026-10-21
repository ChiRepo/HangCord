// Least privilege: only these app commands exist for the webview, and the capability file
// (capabilities/default.json) must grant each one explicitly.
fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
        "cache_get",
        "cache_put",
        "cache_delete",
        "cache_keys",
        "cache_wipe",
        "governor_status",
        "set_lightweight",
        "app_info",
    ])))
    .expect("failed to run tauri-build");
}
