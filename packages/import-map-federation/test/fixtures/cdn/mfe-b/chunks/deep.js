import * as React from 'react';           // transitive, nested path, never rewritten
export const deep = () => React.version + '/' + React.marker.owner;
