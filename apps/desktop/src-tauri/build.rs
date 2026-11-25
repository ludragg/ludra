fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").is_ok_and(|system| system == "windows") {
        println!("cargo:rerun-if-changed=native/nvenc");
        cc::Build::new()
            .file("native/nvenc/shim.c")
            .include("native/nvenc")
            .compile("ludra_nvenc");
    }
    tauri_build::build()
}
