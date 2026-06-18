const API = {
  async getProjects() {
    return (await fetch("/api/projects", { cache: "no-store" })).json();
  },
  async createProject(name) {
    return (await fetch("/api/projects", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ name })
    })).json();
  },
  async deleteProject(name) {
    return (await fetch("/api/projects/" + encodeURIComponent(name), { method: "DELETE" })).json();
  },
  async getFiles(project) {
    return (await fetch("/api/files?project=" + encodeURIComponent(project), { cache: "no-store" })).json();
  },
  async readFile(project, filePath) {
    return (await fetch("/api/files/read?project=" + encodeURIComponent(project) + "&path=" + encodeURIComponent(filePath), { cache: "no-store" })).json();
  },
  async saveFile(project, filePath, content) {
    return (await fetch("/api/files/save", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ project, filePath, content })
    })).json();
  },
  async createFile(project, filePath, content) {
    return (await fetch("/api/files/create", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ project, filePath, content })
    })).json();
  },
  async deleteFile(project, filePath) {
    return (await fetch("/api/files?project=" + encodeURIComponent(project) + "&path=" + encodeURIComponent(filePath), { method: "DELETE" })).json();
  },
  async restoreFile(project, filePath) {
    return (await fetch("/api/files/restore", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ project, filePath })
    })).json();
  },
  async getAllFiles(project) {
    return (await fetch("/api/files/all?project=" + encodeURIComponent(project), { cache: "no-store" })).json();
  }
};
