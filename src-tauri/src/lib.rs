use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
#[cfg(target_os = "macos")]
use tauri::RunEvent;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

const TRAY_ID: &str = "main";

/// Show the main window (creating nothing; it always exists, it is only hidden).
fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Small always-on-top window for the global quick-add shortcut.
fn show_quick_add(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("quick") {
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let built = WebviewWindowBuilder::new(app, "quick", WebviewUrl::App("index.html#quick".into()))
        .title("Quick add")
        .inner_size(600.0, 150.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .center()
        .focused(true)
        .build();
    if let Ok(w) = built {
        // Dismiss when it loses focus, like Spotlight.
        let handle = w.clone();
        w.on_window_event(move |event| {
            if let WindowEvent::Focused(false) = event {
                let _ = handle.hide();
            }
        });
    }
}

/// Menu bar text next to the icon (the running task timer). Empty string clears it.
#[tauri::command]
fn set_tray_title(app: AppHandle, title: String) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_title(if title.is_empty() { None } else { Some(title) });
    }
}

#[tauri::command]
fn hide_quick_add(app: AppHandle) {
    if let Some(w) = app.get_webview_window("quick") {
        let _ = w.hide();
    }
}

pub fn run() {
    let shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Space);

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, sc, event| {
                    if sc == &shortcut && event.state() == ShortcutState::Pressed {
                        show_quick_add(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![set_tray_title, hide_quick_add])
        .setup(move |app| {
            use tauri_plugin_global_shortcut::GlobalShortcutExt;
            app.global_shortcut().register(shortcut)?;

            let quick = MenuItem::with_id(app, "quick", "Quick add", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "Open Todojam", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Todojam", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&quick, &show, &sep, &quit])?;

            TrayIconBuilder::with_id(TRAY_ID)
                .icon(app.default_window_icon().cloned().expect("app icon"))
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "quick" => show_quick_add(app),
                    "show" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the main window hides it, so reminders keep firing from the menu bar.
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Todojam");

    app.run(|_app, _event| {
        // Clicking the Dock icon brings the window back (macOS only event).
        #[cfg(target_os = "macos")]
        if let RunEvent::Reopen { .. } = _event {
            show_main(_app);
        }
    });
}
