#[derive(Clone, Copy, PartialEq)]
pub enum Backend {
    Amf,
    Nvenc,
    Windows,
}

impl Backend {
    pub const ALL: [Self; 3] = [Self::Amf, Self::Nvenc, Self::Windows];

    pub fn id(self) -> &'static str {
        match self {
            Self::Amf => "amf",
            Self::Nvenc => "nvenc",
            Self::Windows => "windows",
        }
    }

    pub fn parse(id: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|backend| backend.id() == id)
    }
}

#[derive(Clone, Copy, PartialEq)]
pub enum Mode {
    Performance,
    Balanced,
    Quality,
    Extreme,
}

impl Mode {
    pub fn parse(id: &str) -> Self {
        match id {
            "performance" => Self::Performance,
            "quality" => Self::Quality,
            "extreme" => Self::Extreme,
            _ => Self::Balanced,
        }
    }
}
