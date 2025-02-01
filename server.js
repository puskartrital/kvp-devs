require("dotenv").config();
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const https = require("https");
const path = require('path');
const moment = require('moment');

const app = express();
const PORT = process.env.PORT || 3000;

const K8S_API_SERVER = process.env.K8S_API_SERVER; // Kubernetes API URL
const K8S_TOKEN = process.env.K8S_TOKEN; // Read-only token
const K8S_CA_CERT_PATH = process.env.K8S_CA_CERT_PATH; // CA certificate path

// Configure HTTPS agent to use the CA certificate
const agent = new https.Agent({
  ca: fs.readFileSync(K8S_CA_CERT_PATH), // Use the CA certificate
});

// Create Axios instance with custom HTTPS agent
const k8sRequest = axios.create({
  baseURL: K8S_API_SERVER,
  headers: {
    Authorization: `Bearer ${K8S_TOKEN}`,
  },
  httpsAgent: agent, // Attach the custom HTTPS agent
});

// Get all clusters dynamically
app.get("/clusters", (req, res) => {
  const clusters = [{ name: "K8S-Cluster" }]; // Replace with your cluster name
  res.json(clusters);
});

// Get all namespaces in a cluster
app.get("/clusters/:cluster/namespaces", async (req, res) => {
  try {
    const response = await k8sRequest.get("/api/v1/namespaces");
    res.json(response.data.items.map(ns => ns.metadata.name));
  } catch (error) {
    console.error("Error fetching namespaces:", error.response ? error.response.data : error.message);
    res.status(500).json({ error: error.response ? error.response.data : error.message });
  }
});

// Get all namespaces
app.get("/namespaces", async (req, res) => {
  try {
    const response = await k8sRequest.get("/api/v1/namespaces");
    res.json(response.data.items.map(ns => ns.metadata.name));
  } catch (error) {
    console.error("Error fetching namespaces:", error.response ? error.response.data : error.message);
    res.status(500).json({ error: error.response ? error.response.data : error.message });
  }
});

app.get("/clusters/:cluster/namespaces/:namespace/pods", async (req, res) => {
  try {
    const { namespace } = req.params;
    const response = await k8sRequest.get(`/api/v1/namespaces/${namespace}/pods`);
    
    // Extract pod names, statuses, restart counts, and detailed container states
    const pods = response.data.items.map(pod => {
      const restartCount = pod.status.containerStatuses
        ? pod.status.containerStatuses.reduce((total, container) => total + container.restartCount, 0)
        : 0;

      // Determine readiness: format as `0/1` or `1/1` based on container readiness
      const ready = pod.status.containerStatuses
        ? pod.status.containerStatuses.filter(container => container.ready).length
        : 0;
      const totalContainers = pod.status.containerStatuses ? pod.status.containerStatuses.length : 1; // Assuming 1 container if not defined

      // Get pod status (e.g., CrashLoopBackOff, Running, etc.)
      const podStatus = pod.status.phase;
      let podState = 'Unknown'; // Default to 'Unknown' in case there's no matching condition

      if (podStatus === 'Running') {
        // Check for CrashLoopBackOff state
        if (pod.status.containerStatuses && pod.status.containerStatuses.some(container => container.state.waiting && container.state.waiting.reason === "CrashLoopBackOff")) {
          podState = 'CrashLoopBackOff';
        } else {
          podState = 'Running';
        }
      } else if (podStatus === 'Succeeded' || podStatus === 'Failed') {
        podState = podStatus; // For succeeded or failed pods
      } else {
        podState = 'Unknown'; // Any other statuses
      }

      // Calculate pod age from creationTimestamp
      const podAge = moment(pod.metadata.creationTimestamp).fromNow();

      // Collect container status information
      const containerStates = pod.status.containerStatuses.map(container => {
        let stateDetails = '';

        if (container.state.waiting) {
          stateDetails = `Waiting: ${container.state.waiting.reason}`;
        } else if (container.state.terminated) {
          stateDetails = `Terminated: ${container.state.terminated.reason}, Exit Code: ${container.state.terminated.exitCode}`;
        } else if (container.state.running) {
          stateDetails = 'Running';
        } else {
          stateDetails = 'Unknown';
        }

        return {
          containerName: container.name,
          state: stateDetails,
        };
      });

      return {
        name: pod.metadata.name,
        status: podState,  // Ensure the correct status is returned
        ready: `${ready}/${totalContainers}`,
        restartCount: `${restartCount}`,
        age: podAge,  // Include age in the response
        containerStatuses: containerStates,
      };
    });

    res.json(pods);
  } catch (error) {
    console.error("Error fetching pods:", error.response ? error.response.data : error.message);
    res.status(500).json({ error: error.response ? error.response.data : error.message });
  }
});

// Search for pods across all namespaces
app.get("/clusters/:cluster/search", async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      console.error("Query parameter is required");
      return res.status(400).json({ error: "Query parameter is required" });
    }

    console.log("Search query:", query);

    const response = await k8sRequest.get("/api/v1/pods");

    const results = response.data.items
      .filter(pod => pod.metadata.name.includes(query) || pod.metadata.namespace.includes(query))
      .map(pod => {
        const restartCount = pod.status.containerStatuses
          ? pod.status.containerStatuses.reduce((total, container) => total + container.restartCount, 0)
          : 0;

        const ready = pod.status.containerStatuses
          ? pod.status.containerStatuses.filter(container => container.ready).length
          : 0;
        const totalContainers = pod.status.containerStatuses ? pod.status.containerStatuses.length : 1;

        const podStatus = pod.status.phase;
        let podState = 'Unknown';

        if (podStatus === 'Running') {
          if (pod.status.containerStatuses && pod.status.containerStatuses.some(container => container.state.waiting && container.state.waiting.reason === "CrashLoopBackOff")) {
            podState = 'CrashLoopBackOff';
          } else {
            podState = 'Running';
          }
        } else if (podStatus === 'Succeeded' || podStatus === 'Failed') {
          podState = podStatus;
        } else {
          podState = 'Unknown';
        }

        const podAge = moment(pod.metadata.creationTimestamp).fromNow();

        return {
          name: pod.metadata.name,
          namespace: pod.metadata.namespace,
          status: podState,
          ready: `${ready}/${totalContainers}`,
          restartCount: `${restartCount}`,
          age: podAge,
        };
      });

    console.log("Search results:", results);

    res.json(results);
  } catch (error) {
    console.error("Error fetching search results:", error.response ? error.response.data : error.message);
    res.status(500).json({ error: error.response ? error.response.data : error.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
