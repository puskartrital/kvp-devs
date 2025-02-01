import { useState, useEffect } from "react";
import axios from "axios";
import { debounce } from "lodash";  // Import lodash for debounce

function KubernetesMonitor() {
  const [clusters, setClusters] = useState([]);
  const [namespaces, setNamespaces] = useState([]); 
  const [pods, setPods] = useState([]); 
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [selectedNamespace, setSelectedNamespace] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [showNamespaces, setShowNamespaces] = useState(false);
  const [showPods, setShowPods] = useState(false);
  const [noSearchResults, setNoSearchResults] = useState(false);
  const [expandedCluster, setExpandedCluster] = useState(null);
  const [expandedNamespace, setExpandedNamespace] = useState(null);

  // Fetch clusters
  useEffect(() => {
    axios
      .get("/clusters")
      .then((res) => {
        setClusters(res.data || []);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching clusters:", error);
        setLoading(false);
      });
  }, []);

  // Fetch namespaces
  const fetchNamespaces = (cluster) => {
    setSelectedCluster(cluster);
    setShowNamespaces(true);
    axios
      .get(`/clusters/${cluster}/namespaces`)
      .then((res) => {
        setNamespaces(res.data || []);
      })
      .catch((error) => {
        console.error(`Error fetching namespaces for ${cluster}:`, error);
      });
  };

  // Fetch pods
  const fetchPods = (namespace) => {
    setSelectedNamespace(namespace);
    setShowPods(true);
    axios
      .get(`/clusters/${selectedCluster}/namespaces/${namespace}/pods`)
      .then((res) => {
        setPods(res.data || []);
      })
      .catch((error) => {
        console.error(`Error fetching pods for ${namespace}:`, error);
      });
  };

  // Debounced search
  const debouncedSearch = debounce(() => {
    if (!searchQuery) return;

    setSearchResults([]);
    setNoSearchResults(false);

    axios
      .get(`/clusters/${selectedCluster}/search?query=${searchQuery}`)
      .then((res) => {
        if (res.data.length === 0) {
          setNoSearchResults(true);
        } else {
          setSearchResults(res.data || []);
          setNoSearchResults(false);
        }
      })
      .catch((error) => {
        console.error("Error fetching search results:", error);
        setNoSearchResults(true);
      });
  }, 500); // 500ms debounce

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    debouncedSearch();  // Call debounced search
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === "Enter") {
      debouncedSearch();  // Trigger on Enter key press
    }
  };

  const toggleClusterExpansion = (cluster) => {
    if (expandedCluster === cluster) {
      setExpandedCluster(null);
      setShowNamespaces(false);
    } else {
      setExpandedCluster(cluster);
      fetchNamespaces(cluster);
    }
  };

  const toggleNamespaceExpansion = (namespace) => {
    if (expandedNamespace === namespace) {
      setExpandedNamespace(null);
      setShowPods(false);
    } else {
      setExpandedNamespace(namespace);
      fetchPods(namespace);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-xl font-bold">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold text-center mb-6">Kubernetes Pod Monitor</h1>

      {/* Clusters Section */}
      <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {clusters.length > 0 ? (
          clusters.map((cluster) => (
            <div
              key={cluster.name}
              className={`p-6 border rounded-lg shadow-md cursor-pointer transition-all ${expandedCluster === cluster.name ? 'bg-gray-100' : ''}`}
              onClick={() => toggleClusterExpansion(cluster.name)}
            >
              <h2 className="text-xl font-semibold text-center">{cluster.name}</h2>
            </div>
          ))
        ) : (
          <div className="text-center text-gray-500">No clusters found.</div>
        )}
      </div>

      {/* Namespaces Section */}
      {showNamespaces && namespaces.length > 0 && (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mt-6">
          {namespaces.map((ns) => (
            <div
              key={ns}
              className={`p-6 border rounded-lg shadow-md cursor-pointer transition-all ${expandedNamespace === ns ? 'bg-gray-100' : ''}`}
              onClick={() => toggleNamespaceExpansion(ns)}
            >
              <h2 className="text-xl font-semibold text-center">{ns}</h2>
            </div>
          ))}
        </div>
      )}

      {/* Pods Section */}
      {showPods && (
        <div className="mt-6">
          <h2 className="text-2xl font-semibold mb-4 text-center">
            Pods in {selectedNamespace}
          </h2>

          {pods.length === 0 ? (
            <div className="text-center text-xl text-gray-500">
              There are no pods running in this namespace.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-3 text-center">Pod Name</th>
                    <th className="p-3 text-center">Ready</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Restarts</th>
                    <th className="p-3 text-center">Age</th>
                  </tr>
                </thead>
                <tbody>
                  {pods.map((pod) => (
                    <tr key={pod.name} className="border-b hover:bg-gray-50">
                      <td className="p-3 text-center">{pod.name}</td>
                      <td className="p-3 text-center">{pod.ready}</td>
                      <td className="p-3 text-center">
                        <span
                          className={`px-2 py-1 rounded-full ${
                            pod.status === "Running"
                              ? "bg-green-100 text-green-800"
                              : pod.status === "CrashLoopBackOff"
                              ? "bg-red-100 text-red-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {pod.status}
                        </span>
                      </td>
                      <td className="p-3 text-center">{pod.restartCount}</td>
                      <td className="p-3 text-center">{pod.age}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Search Section */}
      <div className="mt-6">
        <div className="flex items-center space-x-4">
          <input
            type="text"
            className="p-3 border rounded-lg w-full"
            placeholder="Search for a pod..."
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
          />
          <button
            onClick={debouncedSearch}
            className="p-3 bg-blue-500 text-white rounded-lg"
          >
            Search
          </button>
        </div>
        {noSearchResults && searchQuery.length > 0 && (
          <div className="text-center text-xl text-gray-500 mt-4">
            Pod not found.
          </div>
        )}
        {searchResults.length > 0 && (
          <div className="mt-4">
            <h2 className="text-2xl font-semibold mb-4 text-center">Search Results</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-3 text-center">Pod Name</th>
                    <th className="p-3 text-center">Namespace</th>
                    <th className="p-3 text-center">Ready</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Restarts</th>
                    <th className="p-3 text-center">Age</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((pod) => (
                    <tr key={pod.name} className="border-b hover:bg-gray-50">
                      <td className="p-3 text-center">{pod.name}</td>
                      <td className="p-3 text-center">{pod.namespace}</td>
                      <td className="p-3 text-center">{pod.ready}</td>
                      <td className="p-3 text-center">
                        <span
                          className={`px-2 py-1 rounded-full ${
                            pod.status === "Running"
                              ? "bg-green-100 text-green-800"
                              : pod.status === "CrashLoopBackOff"
                              ? "bg-red-100 text-red-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {pod.status}
                        </span>
                      </td>
                      <td className="p-3 text-center">{pod.restartCount}</td>
                      <td className="p-3 text-center">{pod.age}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default KubernetesMonitor;
