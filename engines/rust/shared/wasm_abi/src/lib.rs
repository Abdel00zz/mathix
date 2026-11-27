//! `wasm_abi` — Passerelle C WebAssembly partagée sans `static mut` brut.
//! Fournit `alloc`, `dealloc`, `out_ptr`, `out_len`, `out_free` et `write_output`
//! à tous les moteurs Rust de l'espace de travail mathPlus.

use std::cell::RefCell;

thread_local! {
    static OUT_BUF: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

/// Stocke le tampon JSON UTF-8 produit par `process()`.
#[inline]
pub fn write_output(bytes: Vec<u8>) {
    OUT_BUF.with(|cell| *cell.borrow_mut() = bytes);
}

#[no_mangle]
pub extern "C" fn alloc(len: u32) -> *mut u8 {
    let mut buf: Vec<u8> = Vec::with_capacity(len as usize);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, len: u32) {
    if ptr.is_null() || len == 0 {
        return;
    }
    unsafe {
        drop(Vec::from_raw_parts(ptr, 0, len as usize));
    }
}

#[no_mangle]
pub extern "C" fn out_ptr() -> *const u8 {
    OUT_BUF.with(|cell| {
        let b = cell.borrow();
        if b.is_empty() { std::ptr::null() } else { b.as_ptr() }
    })
}

#[no_mangle]
pub extern "C" fn out_len() -> u32 {
    OUT_BUF.with(|cell| cell.borrow().len() as u32)
}

#[no_mangle]
pub extern "C" fn out_free() {
    OUT_BUF.with(|cell| {
        let mut b = cell.borrow_mut();
        b.clear();
        b.shrink_to_fit();
    });
}
