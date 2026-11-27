//! Views module: Student views + feature-gated Admin/Studio views.

pub mod role;
pub mod dashboard;
pub mod revision;
pub mod exercise;
pub mod quiz;
pub mod modals;

#[cfg(feature = "admin")]
pub mod admin;
#[cfg(feature = "admin")]
pub mod studio;
