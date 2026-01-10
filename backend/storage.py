import json
from pathlib import Path
from typing import Any, Dict
from datetime import datetime


class JSONStorage:
    """Simple JSON-based storage for persistence"""

    def __init__(self, filepath: str):
        self.filepath = Path(filepath)
        self.filepath.parent.mkdir(parents=True, exist_ok=True)
        self._ensure_file_exists()

    def _ensure_file_exists(self):
        """Create file with empty dict if it doesn't exist"""
        if not self.filepath.exists():
            self.filepath.write_text(json.dumps({}, indent=2))

    def read(self) -> Dict[str, Any]:
        """Read data from JSON file"""
        try:
            return json.loads(self.filepath.read_text())
        except (json.JSONDecodeError, FileNotFoundError):
            return {}

    def write(self, data: Dict[str, Any]):
        """Write data to JSON file"""
        self.filepath.write_text(json.dumps(data, indent=2, default=str))

    def get(self, key: str, default=None) -> Any:
        """Get a specific key from storage"""
        data = self.read()
        return data.get(key, default)

    def set(self, key: str, value: Any):
        """Set a specific key in storage"""
        data = self.read()
        data[key] = value
        self.write(data)

    def delete(self, key: str):
        """Delete a specific key from storage"""
        data = self.read()
        if key in data:
            del data[key]
            self.write(data)

    def all(self) -> Dict[str, Any]:
        """Get all data"""
        return self.read()

    def clear(self):
        """Clear all data"""
        self.write({})


# Initialize storage instances (relative to storage.py location in backend/)
_storage_dir = Path(__file__).parent / "data"
pdf_storage = JSONStorage(str(_storage_dir / "pdfs.json"))
jobs_storage = JSONStorage(str(_storage_dir / "jobs.json"))