// Least privilege: only these app commands exist for the webview, and the capability file
// (capabilities/default.json) must grant each one explicitly.
fn main() {
    println!("cargo:rerun-if-env-changed=HANGCORD_API_BASE_URL");
    println!("cargo:rerun-if-env-changed=HANGCORD_GATEWAY_BASE_URL");
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "cache_get",
            "cache_put",
            "cache_delete",
            "cache_keys",
            "cache_wipe",
            "governor_status",
            "set_lightweight",
            "app_info",
            "auth_status",
            "auth_password",
            "auth_google",
            "auth_cancel",
            "auth_logout",
            "api_request",
            "gateway_connect",
            "gateway_send",
            "gateway_disconnect",
        ]),
    ))
    .expect("failed to run tauri-build");
}
